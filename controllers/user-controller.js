const bcrypt = require('bcryptjs')
const { User, Comment, Restaurant, Favorite, Like, Followship } = require('../models')
const { getUser } = require('../helpers/auth-helpers')
const { imgurFileHandler } = require('../helpers/file-helpers')

const userController = {
  signUpPage: (req, res) => {
    res.render('signup')
  },
  signUp: (req, res, next) => {
    if (req.body.password !== req.body.passwordCheck) throw new Error('Passwords do not match!')
    User.findOne({ where: { email: req.body.email } }).then(user => {
      if (user) throw new Error('Email already exists!')
      return bcrypt.hash(req.body.password, 10)
    })
      .then(hash => User.create({
        name: req.body.name,
        email: req.body.email,
        password: hash
      }))
      .then(() => {
        req.flash('success_messages', '成功註冊帳號！')
        res.redirect('/signin')
      })
      .catch(err => next(err))
  },
  signInPage: (req, res) => {
    res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/restaurants')
  },
  logout: (req, res) => {
    req.flash('success_messages', '登出成功！')
    req.logout()
    res.redirect('/signin')
  },
  getUser: (req, res, next) => {
    const userId = req.params.id
    return Promise.all([
      User.findOne({ // 用 nest: true 只能抓到第一家餐廳?
        include: [
          { model: Restaurant, as: 'FavoritedRestaurants' },
          { model: User, as: 'Followings' },
          { model: User, as: 'Followers' }
        ],
        where: { id: userId }
      }),
      Comment.findAll({
        include: Restaurant,
        nest: true,
        raw: true,
        where: { userId }
      })
    ])
      .then(([user, comments]) => {
        if (!user) throw new Error("User doesn't exist!")
        user = user.toJSON()
        const uniqueComments = {}
        comments.forEach(c => {
          uniqueComments[c.restaurantId] = c
        })
        const filteredComments = Object.values(uniqueComments)

        res.render('users/profile', {
          user,
          commentCounts: filteredComments?.length || 0,
          comments: comments && filteredComments,
          favoriteCounts: user.FavoritedRestaurants?.length || 0,
          favorites: user.FavoritedRestaurants || null,
          followingCounts: user.Followings?.length || 0,
          followings: user.Followings || null,
          followerCounts: user.Followers?.length || 0,
          followers: user.Followers || null,
          editable: user.id === getUser(req).id
        })
      })
      .catch(err => next(err))
  },
  editUser: (req, res, next) => {
    return User.findByPk(req.params.id, { raw: true })
      .then(user => {
        if (!user) throw new Error("User doesn't exist!")
        res.render('users/edit', { user })
      })
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    const { name } = req.body
    if (!name) throw new Error('Username is required!')
    const { file } = req
    return Promise.all([
      User.findByPk(req.params.id),
      imgurFileHandler(file)
    ])
      .then(([user, filePath]) => {
        if (!user) throw new Error("User doesn't exist!")
        return user.update({
          name,
          image: filePath || user.image
        })
      })
      .then(() => {
        req.flash('success_messages', '使用者資料編輯成功')
        res.redirect(`/users/${req.params.id}`) // 如果傳入參數 user 改用 `/users/${user.id}`，測試無法過
      })
      .catch(err => next(err))
  },
  addFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Favorite.findOne({
        where: {
          userId: getUser(req).id,
          restaurantId
        }
      })
    ])
      .then(([restaurant, favorite]) => {
        if (!restaurant) throw new Error("Restaurant doesn't exist!")
        if (favorite) throw new Error('You have already added it to favorite!')
        return Favorite.create({
          userId: getUser(req).id,
          restaurantId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFavorite: (req, res, next) => {
    return Favorite.findOne({
      where: {
        userId: getUser(req).id,
        restaurantId: req.params.restaurantId
      }
    })
      .then(favorite => {
        if (!favorite) throw new Error("You haven't added it to favorite yet!")
        return favorite.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  addLike: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Like.findOne({
        where: {
          userId: getUser(req).id,
          restaurantId
        }
      })
    ])
      .then(([restaurant, like]) => {
        if (!restaurant) throw new Error("Restaurant doesn't exist!")
        if (like) throw new Error('You have already liked this restaurant!')
        return Like.create({
          userId: getUser(req).id,
          restaurantId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeLike: (req, res, next) => {
    return Like.findOne({
      where: {
        userId: getUser(req).id,
        restaurantId: req.params.restaurantId
      }
    })
      .then(like => {
        if (!like) throw new Error("You haven't liked this restaurant yet!")
        return like.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  getTopUsers: (req, res, next) => {
    return User.findAll({
      include: [{ model: User, as: 'Followers' }]
    })
      .then(users => {
        const result = users
          .map(user => ({
            ...user.toJSON(),
            followerCount: user.Followers.length,
            isFollowed: getUser(req).Followings.some(f => f.id === user.id)
          }))
          .sort((a, b) => b.followerCount - a.followerCount)
        res.render('top-users', { users: result })
      })
      .catch(err => next(err))
  },
  addFollowing: (req, res, next) => {
    const userId = Number(req.params.userId)
    if (userId === getUser(req).id) throw new Error('Self-following is not allowed.')
    return Promise.all([
      User.findByPk(userId),
      Followship.findOne({
        where: {
          followerId: getUser(req).id,
          followingId: userId
        }
      })
    ])
      .then(([user, followship]) => {
        if (!user) throw new Error("User doesn't exist!")
        if (followship) throw new Error('You are already following this user!')
        return Followship.create({
          followerId: getUser(req).id,
          followingId: userId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    return Followship.findOne({
      where: {
        followerId: getUser(req).id,
        followingId: req.params.userId
      }
    })
      .then(followship => {
        if (!followship) throw new Error("You haven't followed this user!")
        return followship.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  }
}
module.exports = userController
